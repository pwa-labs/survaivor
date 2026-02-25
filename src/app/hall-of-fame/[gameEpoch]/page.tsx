import { GameReplayClient } from "@/components/game-replay-client";

export default async function GameReplayPage({
  params,
}: {
  params: Promise<{ gameEpoch: string }>;
}) {
  const { gameEpoch } = await params;
  const parsed = Number(gameEpoch);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return <GameReplayClient gameEpoch={-1} />;
  }
  return <GameReplayClient gameEpoch={parsed} />;
}
