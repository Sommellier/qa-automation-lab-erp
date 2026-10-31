import { StatusModal } from './StatusModal';
import type { ManagedUser } from '../types/user';

interface UserStatusModalProps {
  user: ManagedUser;
  isSubmitting: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function UserStatusModal({ user, isSubmitting, onCancel, onConfirm }: UserStatusModalProps) {
  return (
    <StatusModal
      entityLabel="usuário"
      entityName={user.name}
      active={user.active}
      isSubmitting={isSubmitting}
      testIdPrefix="user"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
