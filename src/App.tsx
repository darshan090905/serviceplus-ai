import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { CustomerLayout } from './components/layout/CustomerLayout'
import { TechLayout } from './components/layout/TechLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Loader2 } from 'lucide-react'

const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const PublicPayPage = lazy(() => import('./pages/PublicPayPage').then((m) => ({ default: m.PublicPayPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))
const AmcContractsPage = lazy(() => import('./pages/AmcContractsPage').then((m) => ({ default: m.AmcContractsPage })))
const AmcDetailPage = lazy(() => import('./pages/AmcDetailPage').then((m) => ({ default: m.AmcDetailPage })))
const AssetsPage = lazy(() => import('./pages/AssetsPage').then((m) => ({ default: m.AssetsPage })))
const DispatchPage = lazy(() => import('./pages/DispatchPage').then((m) => ({ default: m.DispatchPage })))
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })))
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage })))
const TechnicianDetailPage = lazy(() => import('./pages/TechnicianDetailPage').then((m) => ({ default: m.TechnicianDetailPage })))
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })))
const ComplaintDetailPage = lazy(() => import('./pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const InvoicePage = lazy(() => import('./pages/InvoicePage').then((m) => ({ default: m.InvoicePage })))
const RetentionPage = lazy(() => import('./pages/RetentionPage').then((m) => ({ default: m.RetentionPage })))
const RetentionDetailPage = lazy(() => import('./pages/RetentionDetailPage').then((m) => ({ default: m.RetentionDetailPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const PortalHomePage = lazy(() => import('./pages/portal/PortalHomePage').then((m) => ({ default: m.PortalHomePage })))
const PortalAmcPage = lazy(() => import('./pages/portal/PortalAmcPage').then((m) => ({ default: m.PortalAmcPage })))
const PortalServicesPage = lazy(() => import('./pages/portal/PortalServicesPage').then((m) => ({ default: m.PortalServicesPage })))
const PortalVisitPage = lazy(() => import('./pages/portal/PortalVisitPage').then((m) => ({ default: m.PortalVisitPage })))
const PortalPaymentsPage = lazy(() => import('./pages/portal/PortalPaymentsPage').then((m) => ({ default: m.PortalPaymentsPage })))
const PortalComplaintsPage = lazy(() => import('./pages/portal/PortalComplaintsPage').then((m) => ({ default: m.PortalComplaintsPage })))
const PortalComplaintFormPage = lazy(() => import('./pages/portal/PortalComplaintFormPage').then((m) => ({ default: m.PortalComplaintFormPage })))
const PortalComplaintDetailPage = lazy(() => import('./pages/portal/PortalComplaintDetailPage').then((m) => ({ default: m.PortalComplaintDetailPage })))
const TechDashboardPage = lazy(() => import('./pages/tech/TechDashboardPage').then((m) => ({ default: m.TechDashboardPage })))
const TechJobsPage = lazy(() => import('./pages/tech/TechJobsPage').then((m) => ({ default: m.TechJobsPage })))
const TechComplaintsPage = lazy(() => import('./pages/tech/TechComplaintsPage').then((m) => ({ default: m.TechComplaintsPage })))
const TechComplaintDetailPage = lazy(() => import('./pages/tech/TechComplaintDetailPage').then((m) => ({ default: m.TechComplaintDetailPage })))
const TechInboxPage = lazy(() => import('./pages/tech/TechInboxPage').then((m) => ({ default: m.TechInboxPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    </div>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/pay/:refId" element={<PublicPayPage />} />

          <Route
            element={
              <RequireAuth role="admin">
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="amc-contracts" element={<AmcContractsPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="amc-contracts/:id" element={<AmcDetailPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="services/:id" element={<ServiceDetailPage />} />
            <Route path="services/technicians/:id" element={<TechnicianDetailPage />} />
            <Route path="complaints" element={<ComplaintsPage />} />
            <Route path="complaints/:id" element={<ComplaintDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="invoices/:id" element={<InvoicePage />} />
            <Route path="retention" element={<RetentionPage />} />
            <Route path="retention/:id" element={<RetentionDetailPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route
            element={
              <RequireAuth role="technician">
                <TechLayout />
              </RequireAuth>
            }
          >
            <Route path="tech" element={<TechDashboardPage />} />
            <Route path="tech/jobs" element={<TechJobsPage />} />
            <Route path="tech/complaints" element={<TechComplaintsPage />} />
            <Route path="tech/complaints/:id" element={<TechComplaintDetailPage />} />
            <Route path="tech/inbox" element={<TechInboxPage />} />
          </Route>

          <Route
            element={
              <RequireAuth role="customer">
                <CustomerLayout />
              </RequireAuth>
            }
          >
            <Route path="portal" element={<PortalHomePage />} />
            <Route path="portal/amc" element={<PortalAmcPage />} />
            <Route path="portal/services" element={<PortalServicesPage />} />
            <Route path="portal/visits/:id" element={<PortalVisitPage />} />
            <Route path="portal/payments" element={<PortalPaymentsPage />} />
            <Route path="portal/invoices/:id" element={<InvoicePage />} />
            <Route path="portal/complaints" element={<PortalComplaintsPage />} />
            <Route path="portal/complaints/new" element={<PortalComplaintFormPage />} />
            <Route path="portal/complaints/:id" element={<PortalComplaintDetailPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}