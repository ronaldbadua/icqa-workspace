import { PageHero } from "@/components/dashboard/page-hero";
import { StaffingPanel } from "@/components/dashboard/staffing-panel";
import { isSupabaseConfigured } from "@/lib/data/queries";
import { getStaffingRecords } from "@/app/actions/staffing";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StaffingPage({ searchParams }: Props) {
  const { date } = await searchParams;
  const selectedDate = date ?? todayDate();
  const hasSupabase = isSupabaseConfigured();

  const { data: records, error } = await getStaffingRecords(selectedDate);

  const isSchemaError =
    error?.toLowerCase().includes("schema cache") ||
    error?.toLowerCase().includes("staffing_records") ||
    error?.toLowerCase().includes("does not exist");

  return (
    <>
      <PageHero
        kicker="Workforce management"
        title="Staffing"
        pill="Daily Staffing"
      />
      <StaffingPanel
        records={records}
        selectedDate={selectedDate}
        hasSupabase={hasSupabase}
        queryError={isSchemaError ? error : error && error !== "missing_config" ? error : null}
        isSchemaError={isSchemaError ?? false}
      />
    </>
  );
}
