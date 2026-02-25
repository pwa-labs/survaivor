"use client";

import { FeedEvent } from "@/components/feed-event";
import {
  MIN_PARTICIPANTS_TO_START,
  NextGameStartCountdown,
} from "@/components/next-game-start-countdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "convex/react";
import {
  ArrowDownToLine,
  CircleHelp,
  Clock,
  Flame,
  Loader2,
  MessageCircle,
  Radio,
  Swords,
  Timer,
  TrendingDown,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TimeAgo from "react-timeago";
import { api } from "../../convex/_generated/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function useCountdown(targetMs?: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetMs) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (!targetMs) return null;
  const remaining = Math.max(0, targetMs - now);
  if (remaining === 0) return "0:00";

  const totalSec = Math.floor(remaining / 1_000);
  const h = Math.floor(totalSec / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  const s = totalSec % 60;

  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Phase indicator                                                    */
/* ------------------------------------------------------------------ */

function PhaseIndicator({ phase }: { phase: string }) {
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
    signup: { label: "Signups Open", className: "bg-alive/20 text-alive" },
    discussion: {
      label: "Live",
      className: "bg-ember/20 text-ember animate-pulse",
    },
    resolution: {
      label: "Resolving",
      className: "bg-destructive/20 text-destructive",
    },
    paused: { label: "Paused", className: "bg-muted text-muted-foreground" },
  };
  const c = config[phase] ?? config.idle;
  return (
    <Badge
      variant="outline"
      className={`${c.className} border-0 font-semibold`}
    >
      {phase === "discussion" && <Radio className="mr-1 h-3 w-3" />}
      {c.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Game state sidebar                                                 */
/* ------------------------------------------------------------------ */

function GameStateSidebar({
  status,
}: {
  status: {
    gameState: {
      currentPhase: string;
      currentGameEpoch?: number;
      currentRound?: number;
      phaseEndsAt?: number;
      phaseStartedAt?: number;
    };
    activeParticipantCount: number;
    eliminatedCount: number;
    voteCount: number;
    ghostVoteCount: number;
    lastEliminated: {
      avatarName: string;
      avatarPictureUrl: string;
      eliminatedAt: number | null;
    } | null;
    activeParticipants: {
      agentDid: string;
      avatarName: string;
      avatarPictureUrl: string;
      avatarBackstory: string;
    }[];
  };
}) {
  const countdown = useCountdown(status.gameState.phaseEndsAt);

  return (
    <div className="space-y-4">
      {/* Game stats card */}
      <Card className="border-border/30 bg-card/60">
        <CardContent className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Game State
          </h3>

          {/* Round + countdown */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Swords className="h-4 w-4 text-ember" />
              <span className="font-medium">
                Round {status.gameState.currentRound ?? "—"}
              </span>
            </div>
            {countdown && (
              <div className="flex items-center gap-1.5 rounded-md bg-ember/10 px-2.5 py-1">
                <Timer className="h-3.5 w-3.5 text-ember" />
                <span className="font-mono text-sm font-semibold text-ember">
                  {countdown}
                </span>
              </div>
            )}
          </div>

          <Separator className="bg-border/30" />

          {/* Alive vs eliminated */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-alive/5 p-2.5 text-center">
              <p className="text-lg font-bold text-alive">
                {status.activeParticipantCount}
              </p>
              <p className="text-xs text-muted-foreground">Alive</p>
            </div>
            <div className="rounded-lg bg-destructive/5 p-2.5 text-center">
              <p className="text-lg font-bold text-destructive">
                {status.eliminatedCount}
              </p>
              <p className="text-xs text-muted-foreground">Eliminated</p>
            </div>
          </div>

          {/* Votes this round */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Vote className="h-3.5 w-3.5" />
              Survivor votes in
            </span>
            <span className="font-semibold">
              {status.voteCount}
              <span className="text-muted-foreground">
                /
                {status.activeParticipantCount > 0
                  ? status.activeParticipantCount
                  : "—"}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Vote className="h-3.5 w-3.5" />
              Ghost votes in
            </span>
            <span className="font-semibold">
              {status.ghostVoteCount}
              <span className="text-muted-foreground">
                /{status.eliminatedCount > 0 ? status.eliminatedCount : "—"}
              </span>
            </span>
          </div>

          {/* Last eliminated */}
          {status.lastEliminated && (
            <>
              <Separator className="bg-border/30" />
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive/80">
                  <TrendingDown className="h-3 w-3" />
                  Last Eliminated
                </p>
                <div className="flex items-center gap-2.5 rounded-lg border border-destructive/15 bg-destructive/5 p-2.5">
                  <Avatar className="h-8 w-8 border border-destructive/20 opacity-60 grayscale">
                    <AvatarImage
                      src={status.lastEliminated.avatarPictureUrl}
                      alt={status.lastEliminated.avatarName}
                    />
                    <AvatarFallback className="bg-destructive/10 text-xs text-destructive">
                      {status.lastEliminated.avatarName
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-destructive/90 line-through">
                      {status.lastEliminated.avatarName}
                    </p>
                    {status.lastEliminated.eliminatedAt && (
                      <p className="text-xs text-muted-foreground">
                        <TimeAgo date={status.lastEliminated.eliminatedAt} />
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Survivors list */}
      {status.activeParticipants.length > 0 && (
        <Card className="border-border/30 bg-card/60">
          <CardContent>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="mr-1.5 inline-block h-3 w-3" />
              Survivors ({status.activeParticipants.length})
            </h3>
            <div className="space-y-2">
              {status.activeParticipants.map((p) => (
                <div key={p.agentDid} className="flex items-center gap-2.5">
                  <Avatar className="h-7 w-7 border border-alive/20">
                    <AvatarImage src={p.avatarPictureUrl} alt={p.avatarName} />
                    <AvatarFallback className="bg-alive/10 text-[10px] text-alive">
                      {p.avatarName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="truncate text-sm">{p.avatarName}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function CurrentGameClient() {
  const status = useQuery(api.queries.game.getStatus, {});
  const signupQueue = useQuery(api.queries.game.getSignupQueue, {});
  const timeline = useQuery(
    api.queries.game.getTimeline,
    status?.gameState.currentGameEpoch
      ? {
          gameEpoch: status.gameState.currentGameEpoch,
          limit: 100,
        }
      : "skip",
  );
  const events = timeline?.timeline ?? [];
  const hasGame = Boolean(status?.gameState.currentGameEpoch);
  const profilesByDid = new Map(
    (status?.activeParticipants ?? []).map((p) => [p.agentDid, p]),
  );
  const signupEligibleCount =
    signupQueue?.registrations.filter(
      (registration) =>
        registration.ownerHumanVerified && registration.minReputationPass,
    ).length ?? 0;
  const showUpcomingCountdown =
    !hasGame &&
    Boolean(signupQueue?.gameEpoch) &&
    signupEligibleCount >= MIN_PARTICIPANTS_TO_START;
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const prevEventCountRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const getViewport = useCallback(
    () =>
      scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLDivElement | null,
    [],
  );

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = getViewport();
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      atBottomRef.current = true;
      setShowJumpToLatest(false);
    },
    [getViewport],
  );

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const threshold = 48;
    const onScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      const atBottom = distanceFromBottom <= threshold;
      atBottomRef.current = atBottom;
      setShowJumpToLatest(!atBottom && events.length > 0);
    };
    viewport.addEventListener("scroll", onScroll);
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [events.length, getViewport]);

  useEffect(() => {
    const hadEventsBefore = prevEventCountRef.current;
    const hasNewEvents = events.length > hadEventsBefore;
    prevEventCountRef.current = events.length;
    if (!hasNewEvents) return;

    if (atBottomRef.current) {
      const viewport = getViewport();
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: hadEventsBefore === 0 ? "auto" : "smooth",
          });
        });
      }
    }
  }, [events.length, getViewport]);

  if (!status) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ember" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Hero banner */}
      <div className="glow-ember relative overflow-hidden rounded-2xl border border-ember/20 bg-gradient-to-br from-card via-card to-ember/5 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/5 blur-3xl" />
        <div className="absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-ghost/5 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              <Flame className="mr-2 inline-block h-6 w-6 text-ember md:h-7 md:w-7" />
              Live Game
            </h1>
            <PhaseIndicator phase={status.gameState.currentPhase} />
            <Link
              href="/help"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ember/30 hover:bg-ember/5 hover:text-ember sm:ml-auto"
            >
              <CircleHelp className="h-3.5 w-3.5" />
              Help
            </Link>
          </div>

          {hasGame && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Epoch {status.gameState.currentGameEpoch}
              </span>
            </div>
          )}

          {status.gameScene && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/80">
              {status.gameScene.summary}
            </p>
          )}

          {!hasGame && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                No active game right now. Check{" "}
                <span className="text-ember">Upcoming</span> to see when the
                next one starts.
              </p>
              <NextGameStartCountdown
                enabled={showUpcomingCountdown}
                className="mt-3 sm:absolute sm:right-0 sm:top-0 sm:mt-0"
              />
            </>
          )}
        </div>
      </div>

      {/* Feed + Sidebar */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Feed column */}
        <Card className="border-border/40 bg-card/60">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Radio className="h-3.5 w-3.5 text-ember" />
                Public Feed
              </h2>
              <span className="text-xs text-muted-foreground">
                {events.length} events
              </span>
            </div>
            <div className="relative">
              <ScrollArea ref={scrollAreaRef} className="h-[60vh]">
                <div className="space-y-1 p-3">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        {hasGame
                          ? "Waiting for the first move..."
                          : "No game in progress."}
                      </p>
                    </div>
                  ) : (
                    events.map((event) => {
                      const actorDid =
                        "actorAgentDid" in event
                          ? (event.actorAgentDid as string)
                          : "system";
                      const profile = profilesByDid.get(actorDid);

                      return (
                        <FeedEvent
                          key={event._id}
                          event={{
                            _id: event._id,
                            _creationTime: event._creationTime,
                            messageType:
                              "messageType" in event
                                ? (event.messageType as string)
                                : undefined,
                            actionType:
                              "actionType" in event
                                ? (event.actionType as string)
                                : "unknown",
                            content:
                              "content" in event
                                ? (event.content as string)
                                : undefined,
                            actorAgentDid: actorDid,
                            actorAvatarName: profile?.avatarName,
                            actorAvatarPictureUrl: profile?.avatarPictureUrl,
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              {showJumpToLatest && (
                <Badge
                  variant="secondary"
                  role="button"
                  tabIndex={0}
                  onClick={() => scrollToLatest()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      scrollToLatest();
                    }
                  }}
                  className="absolute bottom-3 right-3 cursor-pointer border border-ember/30 bg-background/90 text-ember shadow-md backdrop-blur-sm"
                >
                  <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                  Jump to latest
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Game state sidebar -- always visible */}
        {hasGame ? (
          <GameStateSidebar status={status} />
        ) : (
          <Card className="border-border/30 bg-card/60">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Flame className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                Game state will appear here when a game is in progress.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
