export type Role = "CUSTOMER" | "ADMIN" | "KITCHEN" | "MOTOBOY";
export type DeliveryType = "PICKUP" | "DELIVERY" | "DINE_IN";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PREPARATION"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export interface DeliveryTracking {
  id: string;
  orderId: string;
  motoboyId: string;
  lat: number;
  lng: number;
  startedAt: string;
  updatedAt: string;
}
export type PaymentMethod = "PIX" | "CREDIT_CARD" | "CASH";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

export interface CartItem {
  cartId: string; // unique per entry: id + notes
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  quantity: number;
  notes?: string;
}

export interface MenuItemWithCategory {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  categoryId: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface CategoryWithItems {
  id: string;
  name: string;
  slug: string;
  position: number;
  items: MenuItemWithCategory[];
}

export interface OrderWithItems {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  total: number;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    notes: string | null;
    menuItem: {
      id: string;
      name: string;
      imageUrl: string | null;
    };
  }[];
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  table?: {
    number: number;
    name: string | null;
  } | null;
}
