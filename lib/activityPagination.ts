/** Read all activity pages; PostgREST caps a single response at 1,000 rows. */
export async function readAllActivityRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: [], error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return { data, error: null };
  }
}
