import Link from "next/link";

type ErrorsWidgetProps = {
  failedListings: number;
  failedJobs: number;
  suspendedProfiles: number;
};

export function ErrorsWidget({
  failedListings,
  failedJobs,
  suspendedProfiles,
}: ErrorsWidgetProps) {
  const total = failedListings + failedJobs + suspendedProfiles;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Nema aktivnih grešaka.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <h3 className="font-semibold text-red-800">Upozorenja</h3>
      <ul className="mt-2 space-y-1 text-sm text-red-700">
        {failedListings > 0 && (
          <li>
            <Link href="/oglasi?status=failed" className="underline">
              {failedListings} oglasa sa greškom
            </Link>
          </li>
        )}
        {failedJobs > 0 && (
          <li>
            <Link href="/logovi" className="underline">
              {failedJobs} neuspješnih poslova (7 dana)
            </Link>
          </li>
        )}
        {suspendedProfiles > 0 && (
          <li>{suspendedProfiles} suspendovanih profila</li>
        )}
      </ul>
    </div>
  );
}
