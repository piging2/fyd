"use client";
import {useRef,useState} from "react";
import {EditorialSymbol} from "@/fyd/components/editorial-symbols";
export function Navigation({items}:{items:{label:string;pageSlug:string}[]}){
const [open,setOpen]=useState(false);const button=useRef<HTMLButtonElement>(null);
return <header className="ed-header" onKeyDown={e=>{if(e.key==="Escape"&&open){setOpen(false);button.current?.focus()}}}><a className="ed-logo" href="/" aria-label="PING home">PING<EditorialSymbol concept="continuity"/></a><button ref={button} className="ed-menu-toggle" aria-expanded={open} aria-controls="main-navigation" onClick={()=>setOpen(!open)}>{open?"Close":"Menu"}<span aria-hidden="true">{open?"−":"+"}</span></button><nav id="main-navigation" data-open={open} aria-label="Main navigation">{items.map(item=><a key={item.pageSlug} href={item.pageSlug.startsWith("/")?item.pageSlug:"/#"+item.pageSlug} onClick={()=>setOpen(false)}>{item.label}</a>)}<a className="ed-nav-contact" href="/#contact" onClick={()=>setOpen(false)}>Let’s talk <span aria-hidden="true">↗</span></a></nav></header>}
