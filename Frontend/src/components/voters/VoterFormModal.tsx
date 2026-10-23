import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounce } from '../../hooks/useDebounce';
import { useWards } from '../../hooks/useWards';
import { ApiError, errorMessage } from '../../services/apiError';
import { voterService } from '../../services/voterService';
import { VOTER_STATUSES, type DuplicateCheckResult, type Voter, type VoterInput } from '../../types';
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
  mobile: '',
  wardId: '',
  boothId: '',
  houseNumber: '',
  householdId: '',
  address: '',
  status: '',
};

const FIELDS = Object.keys(EMPTY) as (keyof VoterFormValues)[];

export function VoterFormModal({ state, onClose, onSaved }: Props) {
  const { wards, boothsForWard, loaded } = useWards();
  const [serverError, setServerError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<DuplicateCheckResult | null>(null);
  // A ref, not state: the submit handler must see the value set by the button click in the same event.
  const saveMode = useRef<'save' | 'another'>('save');

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
    defaultValues: { ...EMPTY, ...state.initial },
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
    saveMode.current = 'save'; // pressing Enter later should be a plain save
    const input = voterSchema.parse(values) as VoterInput;
    try {
      const saved = state.mode === 'edit' && state.recordId ? await voterService.update(state.recordId, input) : await voterService.create(input);
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
          <div className="alert alert-warning">
            <AlertTriangle size={18} aria-hidden="true" />A voter with this Voter ID already exists.
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
          <FormField label="Voter ID / Electoral ID" error={errors.voterId?.message} required>
            <input className="input" autoComplete="off" {...register('voterId')} />
          </FormField>
          <FormField label="Full name" error={errors.fullName?.message} required>
            <input className="input" autoComplete="off" {...register('fullName')} />
          </FormField>
          <FormField label="Mobile number" error={errors.mobile?.message} hint="Optional">
            <input className="input" type="tel" inputMode="numeric" maxLength={14} {...register('mobile')} />
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
          <FormField label="Ward" error={errors.wardId?.message} required>
            <select className="select" {...register('wardId')}>
              <option value="">Select ward</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  Ward {w.number} – {w.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Booth" error={errors.boothId?.message} required hint={!wardId ? 'Select a ward first' : undefined}>
            <select className="select" {...register('boothId')}>
              <option value="">{wardId ? 'Select booth' : 'Select a ward first'}</option>
              {booths.map((b) => (
                <option key={b.id} value={b.id}>
                  Booth {b.number} – {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="House number" error={errors.houseNumber?.message} required>
            <input className="input" autoComplete="off" {...register('houseNumber')} />
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
