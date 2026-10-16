import { ParticipantsView } from '@/components/tournament/participants-view';

interface Props {
  params: Promise<{ slug: string; country: string }>;
  searchParams: Promise<{ group?: string; page?: string; q?: string }>;
}

export default async function CountryPlayersPage({ params, searchParams }: Props) {
  const { slug, country } = await params;
  return <ParticipantsView params={Promise.resolve({ slug })} searchParams={searchParams} countryCode={country} />;
}
