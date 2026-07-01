import { OrderStatus } from "@/types";
import { Clock, ChefHat, CheckCircle, Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";

export const KITCHEN_COLUMNS: { status: OrderStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "PENDING", label: "Pendente", icon: <Clock size={15} />, color: "yellow" },
  { status: "CONFIRMED", label: "Confirmado", icon: <Clock size={15} />, color: "blue" },
  { status: "IN_PREPARATION", label: "Em Preparo", icon: <ChefHat size={15} />, color: "orange" },
  { status: "READY", label: "Pronto", icon: <CheckCircle size={15} />, color: "green" },
];

export const NEXT_STATUS: Record<string, OrderStatus> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "IN_PREPARATION",
  IN_PREPARATION: "READY",
  READY: "DELIVERED",
};

export const PREV_STATUS: Record<string, OrderStatus> = {
  CONFIRMED: "PENDING",
  IN_PREPARATION: "CONFIRMED",
  READY: "IN_PREPARATION",
};

export const STATUS_COLORS: Record<string, string> = {
  yellow: "border-yellow-500/40 bg-yellow-500/5",
  blue: "border-blue-500/40 bg-blue-500/5",
  orange: "border-orange-500/40 bg-orange-500/5",
  green: "border-green-500/40 bg-green-500/5",
};

export const BADGE_COLORS: Record<string, string> = {
  yellow: "bg-yellow-400/20 text-yellow-300",
  blue: "bg-blue-400/20 text-blue-300",
  orange: "bg-orange-400/20 text-orange-300",
  green: "bg-green-400/20 text-green-300",
};

export const HEADER_COLORS: Record<string, string> = {
  yellow: "text-yellow-400",
  blue: "text-blue-400",
  orange: "text-orange-400",
  green: "text-green-400",
};

export const DELIVERY_TYPE_META = {
  DELIVERY: { label: "Entrega", icon: Bike,            className: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  PICKUP:   { label: "Retirada", icon: ShoppingBag,    className: "bg-blue-400/15 text-blue-300 border-blue-400/30" },
  DINE_IN:  { label: "Mesa",     icon: UtensilsCrossed, className: "bg-purple-400/15 text-purple-300 border-purple-400/30" },
} as const;
