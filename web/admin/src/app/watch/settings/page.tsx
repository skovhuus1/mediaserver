import { CustomerSettings } from '../../../components/customer-settings';
import { AuthenticatedCustomerShell } from '../../../components/authenticated-customer-shell';

export default function WatchSettingsPage() {
  return <AuthenticatedCustomerShell><CustomerSettings /></AuthenticatedCustomerShell>;
}
