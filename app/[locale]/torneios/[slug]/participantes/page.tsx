import { ParticipantsView } from '@/components/tournament/participants-view';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string; page?: string; q?: string; pais?: string }>;
}

export default function ParticipantsPage(props: Props) {
  return <ParticipantsView {...props} />;
}
