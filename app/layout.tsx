import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/StoreUI";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { getProducts } from "@/lib/catalog";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Velora Botanicals · Ringg Assist for Beauty",
  description: "Demo skincare store with Vee, an AI shopping and support assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fraunces.variable} antialiased`}>
        <CartProvider>
          <Header />
          <main className="min-h-[70vh]">{children}</main>
          <footer className="mt-20 border-t border-line bg-cream">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted sm:grid-cols-3">
              <div>
                <p className="font-display text-lg text-ink">Velora Botanicals</p>
                <p className="mt-1">Cruelty-free Indian skincare. A fictional brand for the Ringg Assist demo.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-ink">Help</p>
                <p>Support: Mon–Sat, 10 AM–7 PM IST</p>
                <p>Free shipping on ₹499+ · COD up to ₹3,000</p>
                <p>7-day returns on unused products</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-ink">Ringg Assist demo</p>
                <Link href="/dashboard" className="block hover:text-clay">Agent dashboard →</Link>
                <Link href="/test" className="block hover:text-clay">Assistant test suite →</Link>
              </div>
            </div>
          </footer>
          <ChatWidget products={getProducts().map((p) => ({ id: p.product_id, name: p.name }))} />
        </CartProvider>
      </body>
    </html>
  );
}
