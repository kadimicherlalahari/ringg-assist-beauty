import { seed } from "@/lib/db";
import { CartView } from "@/components/CartView";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return <CartView offers={seed.offers} />;
}
