import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { useWards } from '../../hooks/useWards';
import { ApiError, errorMessage } from '../../services/apiError';
import { voterService } from '../../services/voterService';
import { GENDERS, VOTER_STATUSES, type DuplicateCheckResult, type Voter, type VoterInput } from '../../types';
import { wardsInArea } from '../../utils/permissions';
import { voterSchema, type VoterFormValues } from '../../utils/validation';
import { FormField } from '../common/FormField';
import { Modal } from '../common/Modal';
import { SkeletonLines } from '../common/States';

export interface VoterFormState {
  mode: 'create' | 'edit';
  recordId?: string;
  initial?: Partial<VoterInput>;
}

interface Props {
  state: VoterFormState;
  onClose: () => void;
  /** `addAnother` is true when the admin chose "Save & add household member". */
  onSaved: (voter: Voter, addAnother: boolean) => void;
}

const EMPTY: VoterFormValues = {
  voterId: '',
  fullName: '',
  wardId: '',
  boothId: '',
  houseNumber: '',
  householdId: '',
  address: '',
  status: '',
  age: '',
  gender: '',
  serialNumber: '',
};

const FIELDS = Object.keys(EMPTY) as (keyof VoterFormValues)[];

export function VoterFormModal({ state, onClose, onSaved }: Props) {
  const admin = useCurrentAdmin();
  const { wards: allWards, wardLabel, boothsForWard, loaded } = useWards();
  // A Corporator adds and edits voters only in its own wards.
  const wards = wardsInArea(admin, allWards);
  // A Corporator's edits apply to its own list; the Voter ID and ward are shared with the ward's other Corporators.
  const sharedLocked = state.mode === 'edit' && admin.role === 'CORPORATOR';
  const [serverError, setServerError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<DuplicateCheckResult | null>(null);
  // A ref, not state: the submit handler must see the value set by the button click in the same event.
  const saveMode = useRef<'save' | 'another' | 'replace'>('save');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VoterFormValues>({
    resolver: zodResolver(voterSchema),
    defaultValues: {
      ...EMPTY,
      ...state.initial,
      age: state.initial?.age == null ? '' : String(state.initial.age),
      gender: state.initial?.gender ?? '',
      serialNumber: state.initial?.serialNumber == null ? '' : String(state.initial.serialNumber),
    },
  });

  const wardId = watch('wardId');
  const booths = wardId ? boothsForWard(wardId) : [];

  // Reset the booth when it does not belong to the newly selected ward.
  useEffect(() => {
    if (!loaded) return;
    const boothId = getValues('boothId');
    if (boothId && !boothsForWard(wardId).some((b) => b.id === boothId)) setValue('boothId', '');
  }, [loaded, wardId, boothsForWard, getValues, setValue]);

  // Warn about duplicates while typing; the server rejects a duplicate Voter ID on save.
  const voterId = watch('voterId');
  const fullName = watch('fullName');
  const houseNumber = watch('houseNumber');
  const dupKey = useDebounce(JSON.stringify([voterId.trim(), fullName.trim(), houseNumber.trim(), wardId]), 400);
  useEffect(() => {
    const [id, name, house, ward] = JSON.parse(dupKey) as string[];
    if (!id && !(name && house && ward)) {
      setDupes(null);
      return;
    }
    let active = true;
    voterService
      .checkDuplicate({ voterId: id, fullName: name, houseNumber: house, wardId: ward, excludeRecordId: state.recordId })
      .then((r) => active && setDupes(r))
      .catch(() => active && setDupes(null));
    return () => {
      active = false;
    };
  }, [dupKey, state.recordId]);

  const onSubmit = async (values: VoterFormValues) => {
    setServerError(null);
    const addAnother = saveMode.current === 'another';
    const replace = saveMode.current === 'replace';
    saveMode.current = 'save'; // pressing Enter later should be a plain save
    // The resolver already validated and converted the values (e.g. age text → number); do not parse them twice.
    const input = values as unknown as VoterInput;
    // "Replace its details": save over the voter that already has this Voter ID.
    const targetId = replace && dupes?.existing ? dupes.existing.recordId : state.mode === 'edit' ? state.recordId : undefined;
    try {
      const saved = targetId ? await voterService.update(targetId, input) : await voterService.create(input);
      onSaved(saved, addAnother);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          if ((FIELDS as string[]).includes(field)) setError(field as keyof VoterFormValues, { message });
        }
      }
      setServerError(errorMessage(e));
    }
  };

  const title = state.mode === 'edit' ? 'Edit voter' : state.initial?.householdId || state.initial?.houseNumber ? 'Add household member' : 'Add voter';

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="lg"
      locked={isSubmitting}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          {state.mode === 'create' && (
            <button type="submit" form="voter-form" className="btn btn-secondary" disabled={isSubmitting} onClick={() => (saveMode.current = 'another')}>
              Save & add household member
            </button>
          )}
          <button type="submit" form="voter-form" className="btn btn-primary" disabled={isSubmitting} onClick={() => (saveMode.current = 'save')}>
            {isSubmitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            {state.mode === 'edit' ? 'Save changes' : 'Save voter'}
          </button>
        </>
      }
    >
      {!loaded ? (
        <SkeletonLines rows={6} />
      ) : (
      <form id="voter-form" className="stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        {dupes?.voterIdExists && (
          <div className="alert alert-warning" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div className="stack" style={{ gap: 8 }}>
              <span>
                This Voter ID already belongs to {dupes.existing ? `${dupes.existing.fullName} (${wardLabel(dupes.existing.wardId)})` : 'another voter'}.
                {dupes.existing?.canReplace ? ' Choose what to do:' : ' It is outside your wards, so it cannot be replaced here.'}
              </span>
              {dupes.existing?.canReplace && state.mode === 'create' && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={isSubmitting}>
                    Keep the existing voter
                  </button>
                  <button type="submit" form="voter-form" className="btn btn-primary btn-sm" disabled={isSubmitting} onClick={() => (saveMode.current = 'replace')}>
                    Replace its details with these
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {!!dupes?.similar.length && (
          <div className="alert alert-warning">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              Possible duplicate: {dupes.similar.map((s) => `${s.fullName} (${s.voterId})`).join(', ')} already registered at house {dupes.similar[0].houseNumber} in this
              ward.
            </span>
          </div>
        )}

        <div className="form-grid">
          <FormField label="Voter ID / Electoral ID" error={errors.voterId?.message} required hint={sharedLocked ? 'Shared with other Corporators' : undefined}>
            <input className="input" autoComplete="off" readOnly={sharedLocked} {...register('voterId')} />
          </FormField>
          <FormField label="Full name" error={errors.fullName?.message} required>
            <input className="input" autoComplete="off" {...register('fullName')} />
          </FormField>
          <FormField label="Voter status" error={errors.status?.message} required>
            <select className="select" {...register('status')}>
              <option value="">Select status</option>
              {VOTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Ward" error={errors.wardId?.message} required hint={sharedLocked ? 'Shared with other Corporators' : undefined}>
            {sharedLocked ? (
              <>
                <input className="input" value={wardLabel(wardId)} disabled />
                <input type="hidden" {...register('wardId')} />
              </>
            ) : (
              <select className="select" {...register('wardId')}>
                <option value="">Select ward</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    Ward {w.number} – {w.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Booth" error={errors.boothId?.message} hint={!wardId ? 'Select a ward first' : 'Optional'}>
            <select className="select" {...register('boothId')}>
              <option value="">{wardId ? 'No booth' : 'Select a ward first'}</option>
              {booths.map((b) => (
                <option key={b.id} value={b.id}>
                  Booth {b.number} – {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="House / door number" error={errors.houseNumber?.message} required>
            <input className="input" autoComplete="off" {...register('houseNumber')} />
          </FormField>
          <FormField
            label="Serial No."
            error={errors.serialNumber?.message}
            hint={sharedLocked ? 'From the ward roll; shared with other Corporators' : 'Optional. Number in the ward roll'}
          >
            <input className="input" type="number" inputMode="numeric" min={1} readOnly={sharedLocked} {...register('serialNumber')} />
          </FormField>
          <FormField label="Age" error={errors.age?.message} hint="Optional">
            <input className="input" type="number" inputMode="numeric" min={18} max={120} {...register('age')} />
          </FormField>
          <FormField label="Gender" error={errors.gender?.message} hint="Optional">
            <select className="select" {...register('gender')}>
              <option value="">Not given</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Household ID" error={errors.householdId?.message} hint="Optional. Members of one household share this ID.">
            <input className="input" autoComplete="off" {...register('householdId')} />
          </FormField>
          <FormField label="Address" error={errors.address?.message} className="span-2">
            <textarea className="textarea" rows={2} {...register('address')} />
          </FormField>
        </div>
      </form>
      )}
    </Modal>
  );
}
