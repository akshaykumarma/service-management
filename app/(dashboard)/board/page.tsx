"use client";

import TicketBoard from "@/components/ticket-board";
import { SERVICE_BOARD } from "@/components/board-configs";

/** The Service Board (formerly just "Board") — service tickets. */
export default function ServiceBoardPage() {
  return <TicketBoard config={SERVICE_BOARD} />;
}
