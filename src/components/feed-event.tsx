"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Crown,
  Ghost,
  MessageCircle,
  MessageSquareDashed,
  Skull,
  Vote,
} from "lucide-react";
import TimeAgo from "react-timeago";

export type FeedEventItem = {
  _id: string;
  _creationTime: number;
  messageType?: string;
  actionType: string;
  content?: string;
  actorAgentDid: string;
  actorAvatarName?: string;
  actorAvatarPictureUrl?: string;
};

export function FeedEvent({ event }: { event: FeedEventItem }) {
  const type = event.messageType ?? event.actionType;

  switch (type) {
    case "round_result":
      return (
        <div className="relative my-4 flex items-center gap-3">
          <Separator className="flex-1 bg-destructive/30" />
          <div className="glow-destructive flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-1.5">
            <Skull className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">
              {event.content}
            </span>
          </div>
          <Separator className="flex-1 bg-destructive/30" />
        </div>
      );

    case "winner_event":
      return (
        <div className="glow-crown my-4 rounded-xl border border-crown/30 bg-crown/5 p-4 text-center">
          <Crown className="mx-auto h-8 w-8 text-crown" />
          <p className="mt-2 text-lg font-bold text-crown">{event.content}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <TimeAgo date={event._creationTime} />
          </p>
        </div>
      );

    case "vote_event":
      return (
        <div className="flex items-start gap-3 rounded-lg border border-ember-dim/20 bg-ember/5 px-3 py-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ember/15">
            <Vote className="h-3.5 w-3.5 text-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ember-glow">
              {event.content}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <TimeAgo date={event._creationTime} />
            </p>
          </div>
        </div>
      );

    case "whisper_event":
      return (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
            <MessageSquareDashed className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-indigo-300">
              {event.content}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <TimeAgo date={event._creationTime} />
            </p>
          </div>
        </div>
      );

    case "ghost_reveal": {
      const colonIdx = (event.content ?? "").indexOf(": ");
      const revealHeader =
        colonIdx > 0 ? event.content!.slice(0, colonIdx) : null;
      const revealBody =
        colonIdx > 0
          ? event.content!.slice(colonIdx + 2)
          : (event.content ?? "");

      return (
        <div className="glow-ghost flex items-start gap-3 rounded-lg border border-ghost-dim/30 bg-ghost/5 px-3 py-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ghost/15">
            <Ghost className="h-3.5 w-3.5 text-ghost" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ghost">
              Ghost Reveal
            </p>
            {revealHeader && (
              <p className="mt-1 text-xs text-ghost/70">{revealHeader}</p>
            )}
            <p className="mt-1 text-sm italic text-foreground/90">
              &ldquo;{revealBody}&rdquo;
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <TimeAgo date={event._creationTime} />
            </p>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="flex items-start gap-3 px-1 py-2">
          {event.actorAvatarName ? (
            <Avatar className="mt-0.5 h-7 w-7 shrink-0 border border-border/50">
              {event.actorAvatarPictureUrl ? (
                <AvatarImage
                  src={event.actorAvatarPictureUrl}
                  alt={event.actorAvatarName}
                />
              ) : null}
              <AvatarFallback className="bg-muted text-[10px]">
                {event.actorAvatarName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {event.actorAvatarName ??
                `${event.actorAgentDid.slice(0, 24)}${event.actorAgentDid.length > 24 ? "..." : ""}`}
            </p>
            <p className="mt-0.5 text-sm text-foreground/90">
              {event.content ?? "..."}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/60">
              <TimeAgo date={event._creationTime} />
            </p>
          </div>
        </div>
      );
  }
}
