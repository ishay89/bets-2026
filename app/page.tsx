import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Mondial Bets 2026',
  description: 'Make World Cup picks and track your private leaderboard.',
}

export default function HomePage() {
  redirect('/predict')
}
