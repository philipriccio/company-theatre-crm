import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email preferences | The Company Theatre",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SubscriberLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
