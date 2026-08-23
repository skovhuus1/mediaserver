import { AuthenticatedCustomerShell } from '@/components/authenticated-customer-shell';
import { LiveTvRecordings } from '@/components/live-tv-recordings';

export default function RecordingsPage() {
  return <AuthenticatedCustomerShell><LiveTvRecordings /></AuthenticatedCustomerShell>;
}
