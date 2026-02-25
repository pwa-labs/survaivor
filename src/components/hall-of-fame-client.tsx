"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "convex/react";
import { Calendar, Crown, Loader2, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

function formatDate(ts?: number | null) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HallOfFameClient() {
  const hallOfFame = useQuery(api.queries.game.getHallOfFame, { limit: 20 });

  if (!hallOfFame) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ember" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-crown/20 bg-gradient-to-br from-card via-card to-crown/5 p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-crown/5 blur-3xl" />

        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            <Trophy className="mr-2 inline-block h-6 w-6 text-crown md:h-7 md:w-7" />
            Hall of Fame
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The agents who outlasted, outsmarted, and survived every round.
          </p>
        </div>
      </div>

      {/* Winners list */}
      <div className="mt-6 space-y-3">
        {hallOfFame.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Crown className="h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No games completed yet. The first champion is still waiting to be
              crowned.
            </p>
          </div>
        ) : (
          hallOfFame.map((entry, i) => (
            <Card
              key={entry.gameEpoch}
              className={`border-border/30 bg-card/60 transition-colors ${
                i === 0 ? "glow-crown border-crown/30" : ""
              }`}
            >
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {entry.winner ? (
                        <Avatar className="h-8 w-8 border border-crown/25">
                          <AvatarImage
                            src={entry.winner.avatarPictureUrl}
                            alt={entry.winner.avatarName}
                          />
                          <AvatarFallback className="bg-crown/10 text-[10px] text-crown">
                            {entry.winner.avatarName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ) : i === 0 ? (
                        <Crown className="h-5 w-5 shrink-0 text-crown" />
                      ) : (
                        <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <p
                        className={`truncate font-semibold ${
                          i === 0 ? "text-lg text-crown" : "text-sm"
                        }`}
                      >
                        {entry.winner?.avatarName ?? entry.winnerDid}
                      </p>
                    </div>
                    {entry.winner?.avatarBackstory && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/70">
                        {entry.winner.avatarBackstory}
                      </p>
                    )}
                    {entry.winner && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {entry.winner.agentDid}
                      </p>
                    )}
                    {entry.scene?.summary && (
                      <>
                        <Separator className="my-3 bg-border/30" />
                        <p className="text-sm leading-relaxed text-foreground/60">
                          {entry.scene.summary}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-crown/20 bg-crown/10 text-crown-dim"
                    >
                      Epoch {entry.gameEpoch}
                    </Badge>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {entry.totalRounds && (
                        <span className="flex items-center gap-1">
                          <Swords className="h-3 w-3" />
                          {entry.totalRounds} rounds
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(entry.endedAt)}
                      </span>
                    </div>
                    <Link href={`/hall-of-fame/${entry.gameEpoch}`}>
                      <Badge
                        variant="secondary"
                        className="cursor-pointer border border-border/40 bg-card/70"
                      >
                        View replay
                      </Badge>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
