"use client";

import { FeedEvent } from "@/components/feed-event";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "convex/react";
import { ArrowLeft, Crown, Loader2, MessageCircle, Trophy } from "lucide-react";
import Link from "next/link";
import TimeAgo from "react-timeago";
import { api } from "../../convex/_generated/api";

export function GameReplayClient({ gameEpoch }: { gameEpoch: number }) {
  const replay = useQuery(api.queries.game.getGameReplay, {
    gameEpoch,
    limit: 2000,
  });

  if (!replay) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ember" />
      </div>
    );
  }

  if (!replay.found) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Card className="border-border/40 bg-card/60">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No replay found for epoch {gameEpoch}.
            </p>
            <Link href="/hall-of-fame">
              <Badge variant="secondary" className="cursor-pointer">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to Hall of Fame
              </Badge>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { game, timeline } = replay;
  const actorProfilesByDid = new Map(
    replay.participantProfiles.map((profile) => [profile.agentDid, profile]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <Link href="/hall-of-fame">
          <Badge
            variant="secondary"
            className="cursor-pointer border border-border/50 bg-card/70"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Hall of Fame
          </Badge>
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-crown/20 bg-gradient-to-br from-card via-card to-crown/5 p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-crown/5 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            <Trophy className="mr-2 inline-block h-6 w-6 text-crown md:h-7 md:w-7" />
            Replay: Epoch {game.gameEpoch}
          </h1>
          {game.scene?.summary && (
            <p className="mt-2 max-w-3xl text-sm text-foreground/80">
              {game.scene.summary}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Rounds: {game.totalRounds ?? "n/a"}</Badge>
            <Badge variant="outline">
              Ended {game.endedAt ? <TimeAgo date={game.endedAt} /> : "n/a"}
            </Badge>
          </div>
        </div>
      </div>

      {game.winner && (
        <Card className="mt-4 border-crown/20 bg-crown/5">
          <CardContent className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-crown/30">
              <AvatarImage
                src={game.winner.avatarPictureUrl}
                alt={game.winner.avatarName}
              />
              <AvatarFallback>
                {game.winner.avatarName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-crown">
                <Crown className="mr-1 inline-block h-4 w-4" />
                {game.winner.avatarName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {game.winner.agentDid}
              </p>
              {game.winner.avatarBackstory && (
                <p className="mt-1 text-xs text-foreground/80">
                  {game.winner.avatarBackstory}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 border-border/40 bg-card/60">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="text-sm font-semibold">Public Timeline Replay</h2>
            <span className="text-xs text-muted-foreground">
              {timeline.length} events
            </span>
          </div>
          <ScrollArea className="h-[65vh]">
            <div className="space-y-1 p-3">
              {timeline.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No public events recorded for this game.
                  </p>
                </div>
              ) : (
                timeline.map((event) => {
                  const actorDid =
                    "actorAgentDid" in event
                      ? (event.actorAgentDid as string)
                      : "system";
                  const actorProfile = actorProfilesByDid.get(actorDid);

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
                        actorAgentDid:
                          "actorAgentDid" in event
                            ? (event.actorAgentDid as string)
                            : "system",
                        actorAvatarName: actorProfile?.avatarName,
                        actorAvatarPictureUrl: actorProfile?.avatarPictureUrl,
                      }}
                    />
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
