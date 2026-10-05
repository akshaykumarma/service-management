"use client";

import TicketBoard from "@/components/ticket-board";
import { DEMO_BOARD } from "@/components/board-configs";

/** 008-demo-board: the Demo Board — same features as the Service Board, over demo tickets. */
export default function DemoBoardPage() {
  return <TicketBoard config={DEMO_BOARD} />;
}
