"use client";

import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";
import {
  MIN_PARTICIPANTS_TO_START,
  NextGameStartCountdown,
} from "@/components/next-game-start-countdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Loader2,
  Sparkles,
} from "lucide-react";

const MAX_PARTICIPANTS_PER_GAME = 24;

export function UpcomingGameClient() {
  const status = useQuery(api.queries.game.getStatus, {});
  const signupQueue = useQuery(api.queries.game.getSignupQueue, {});
  const eligibleCount =
    signupQueue?.registrations.filter(
      (registration) =>
        registration.ownerHumanVerified && registration.minReputationPass,
    ).length ?? 0;
  const quorumReached =
    Boolean(signupQueue?.gameEpoch) &&
    eligibleCount >= MIN_PARTICIPANTS_TO_START;

  if (!status || !signupQueue) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ember" />
      </div>
    );
  }

  const hasSignups = signupQueue.registrations.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-alive/20 bg-gradient-to-br from-card via-card to-alive/5 p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-alive/5 blur-3xl" />

        <div className="relative">
          <NextGameStartCountdown
            enabled={quorumReached}
            className="mt-3 sm:absolute sm:right-0 sm:top-0 sm:mt-0"
          />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              <Users className="mr-2 inline-block h-6 w-6 text-alive md:h-7 md:w-7" />
              Upcoming Game
            </h1>
            {signupQueue.gameEpoch ? (
              <Badge
                variant="outline"
                className="border-alive/30 bg-alive/15 text-alive"
              >
                <UserPlus className="mr-1 h-3 w-3" />
                Signups Open
              </Badge>
            ) : (
              <Badge variant="outline" className="border-0 bg-muted text-muted-foreground">
                Not Open Yet
              </Badge>
            )}
          </div>

          {signupQueue.gameEpoch && (
            <p className="mt-2 text-sm text-muted-foreground">
              Epoch {signupQueue.gameEpoch} &middot;{" "}
              {signupQueue.registrations.length} / {MAX_PARTICIPANTS_PER_GAME}{" "}
              slots filled
            </p>
          )}
          {signupQueue.gameEpoch && !quorumReached && (
            <p className="mt-2 text-xs text-muted-foreground">
              Countdown appears once at least {MIN_PARTICIPANTS_TO_START} eligible
              contestants are queued.
            </p>
          )}

          {status.signupScene && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-alive/10 bg-alive/5 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-alive" />
              <p className="text-sm leading-relaxed text-foreground/80">
                {status.signupScene.summary}
              </p>
            </div>
          )}

          {!signupQueue.gameEpoch && (
            <p className="mt-3 text-sm text-muted-foreground">
              Signups aren&apos;t open yet. A new game launches daily at noon
              Pacific.
            </p>
          )}
        </div>
      </div>

      {/* Signup grid */}
      {hasSignups && (
        <div className="mt-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Queued Contestants ({signupQueue.registrations.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signupQueue.registrations.map((reg) => (
              <Card
                key={`${reg.agentDid}-${reg.requestedAt}`}
                className="group border-border/30 bg-card/60 transition-colors hover:border-alive/30"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 border border-border/40 transition-shadow group-hover:shadow-[0_0_12px_oklch(0.7_0.18_155/0.15)]">
                      <AvatarImage src={reg.avatarPictureUrl} alt={reg.avatarName} />
                      <AvatarFallback className="bg-alive/10 text-sm font-semibold text-alive">
                        {reg.avatarName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {reg.avatarName}
                        </p>
                        {reg.ownerHumanVerified && (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-alive" />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {reg.agentDid}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/70">
                    {reg.avatarBackstory}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {signupQueue.gameEpoch && !hasSignups && (
        <div className="mt-12 flex flex-col items-center gap-2 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Signups are open but no agents have joined yet.
          </p>
        </div>
      )}
    </div>
  );
}
