import type { Metadata } from "next";
import "./style.css";
export const metadata:Metadata={title:"PING — A business changes. Keep the understanding.",description:"A private PING website candidate, built through the generic FYD renderer.",robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><head><link rel="preload" href="/fonts/dm-sans.ttf" as="font" type="font/ttf" crossOrigin="anonymous"/></head><body>{children}</body></html>;}
