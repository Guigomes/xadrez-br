export type TournamentTabIconName =
  | 'overview'
  | 'pairing'
  | 'registrations'
  | 'participants'
  | 'rounds'
  | 'standings'
  | 'report'
  | 'staff'
  | 'current-round';

const paths: Record<TournamentTabIconName, React.ReactNode> = {
  overview: <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5.25 9.75V21h13.5V9.75M9 21v-6h6v6" />,
  pairing: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h4a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h4m-3-3 3 3-3 3M4 18h4a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4h4m-3-3 3 3-3 3" />,
  registrations: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25H6.75A2.25 2.25 0 0 0 4.5 7.5v12a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-12a2.25 2.25 0 0 0-2.25-2.25H15M9 5.25a3 3 0 0 1 6 0M9 5.25h6M8.25 12h7.5m-7.5 4.5h5.25" />,
  participants: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 21a7.5 7.5 0 0 1 15 0M18 10.5a3 3 0 0 1 3 3m-15-3a3 3 0 0 0-3 3" />,
  rounds: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75h10.5A2.25 2.25 0 0 1 19.5 6v15H4.5V6a2.25 2.25 0 0 1 2.25-2.25ZM8.25 9h7.5m-7.5 4.5h7.5m-7.5 4.5h4.5" />,
  standings: <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25V12h4.5v8.25m1.5 0V6h4.5v14.25m1.5 0V9h4.5v11.25M3 20.25h19.5" />,
  report: <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.75h9L19.5 8.25V21H6V3.75Zm9 0v4.5h4.5M9 12h7.5M9 15.75h7.5M9 19.5h4.5" />,
  staff: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m-6.75-3.75h13.5M5.25 7.5h13.5M5.25 7.5 2.25 13.5h6L5.25 7.5Zm13.5 0-3 6h6l-3-6Z" />,
  'current-round': <path strokeLinecap="round" strokeLinejoin="round" d="m13.5 2.25-8.25 12h6l-.75 7.5 8.25-12h-6l.75-7.5Z" />,
};

export function TournamentTabIcon({ name }: { name: TournamentTabIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-[1.125rem] w-[1.125rem] shrink-0"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
