"use client";

import * as React from "react";
import { motion, useMotionValue, animate } from "framer-motion";

interface TapeMeasureNavProps {
  items: Array<{ href: string; label: string }>;
  activeHref: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * TapeMeasureNav — premium measuring tape navigation indicator
 * 
 * Replaces standard navigation underline with a mechanical tape measure interaction.
 * The tape extends from the logo as the user moves across navigation items.
 * 
 * Motion characteristics:
 * - Confident, precise, engineered
 * - 250-350ms duration (crisp, premium)
 * - Mechanical feel (not elastic, not bouncy)
 * 
 * Color direction:
 * - Body: warm ivory / aged steel
 * - Measurement marks: Ripe Olive
 * - Active highlight: Cavern Clay
 * - Metallic reflections: warm paper white
 */
export function TapeMeasureNav({ items, activeHref, containerRef }: TapeMeasureNavProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [itemPositions, setItemPositions] = React.useState<Array<{ left: number; width: number }>>([]);

  const tapeX = useMotionValue(0);
  const tapeWidth = useMotionValue(0);

  // Calculate item positions on mount and resize
  React.useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const navItems = containerRef.current.querySelectorAll('a');
      const positions = Array.from(navItems).map((item) => {
        const itemRect = item.getBoundingClientRect();
        return {
          left: itemRect.left - containerRect.left,
          width: itemRect.width,
        };
      });
      
      setItemPositions(positions);
      
      // Set initial active position
      const activeIdx = items.findIndex(item => item.href === activeHref);
      if (activeIdx !== -1 && positions[activeIdx]) {
        setActiveIndex(activeIdx);
        tapeX.set(positions[activeIdx].left);
        tapeWidth.set(positions[activeIdx].width);
      }
    };

    // Small delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(updatePositions, 100);
    updatePositions();
    
    window.addEventListener('resize', updatePositions);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePositions);
    };
  }, [items, activeHref, containerRef, tapeX, tapeWidth]);

  // Animate tape to active item with mechanical settle
  React.useEffect(() => {
    const activeIdx = items.findIndex(item => item.href === activeHref);
    if (activeIdx !== -1 && itemPositions[activeIdx]) {
      setActiveIndex(activeIdx);
      
      // Mechanical, crisp animation (300ms) with subtle settle
      animate(tapeX, itemPositions[activeIdx].left, {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1], // Premium cubic-bezier
      });
      
      animate(tapeWidth, itemPositions[activeIdx].width, {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      });
    }
  }, [activeHref, itemPositions, tapeX, tapeWidth, items]);

  return (
    <motion.div
      className="absolute bottom-0 left-0 h-[4px] pointer-events-none z-20"
      style={{
        x: tapeX,
        width: tapeWidth,
      }}
    >
      {/* Tape body - warm ivory / aged steel with subtle texture */}
      <div className="relative h-full w-full bg-[#E6DFD3] overflow-hidden shadow-sm">
        {/* Subtle paper/steel texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0,0,0,0.05) 1px, rgba(0,0,0,0.05) 2px)',
        }} />
        
        {/* Brushed steel highlight - faint reflected daylight across tape */}
        <motion.div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(248, 245, 240, 0.3) 45%, rgba(248, 245, 240, 0.1) 55%, transparent 100%)',
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 0%'],
          }}
          transition={{
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
        
        {/* Soft bevel/edge highlight - top edge */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-b from-[#F8F5F0]/60 to-transparent" />
        
        {/* Soft bevel/edge highlight - bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-t from-[#5E6259]/10 to-transparent" />
        
        {/* Measurement marks - Ripe Olive with refined major/minor hierarchy */}
        <div className="absolute inset-0 flex items-center">
          {Array.from({ length: 40 }).map((_, i) => {
            // Every 12th increment is emphasized (like real tape measures)
            const isMajor = i % 12 === 0;
            const isMedium = i % 4 === 0 && !isMajor;
            
            return (
              <div
                key={i}
                className="absolute bg-[#5E6259]"
                style={{
                  left: `${(i / 40) * 100}%`,
                  height: isMajor ? '100%' : isMedium ? '55%' : '35%',
                  width: isMajor ? '1.5px' : '1px',
                  opacity: isMajor ? '0.45' : isMedium ? '0.2' : '0.12',
                }}
              />
            );
          })}
        </div>
        
        {/* Engraved numbers - laser-engraved feel at major intervals */}
        <div className="absolute inset-0 flex items-center justify-between px-1">
          {[0, 12, 24, 36].map((i) => (
            <span
              key={i}
              className="text-[5.5px] font-medium text-[#5E6259]/20 leading-none tracking-widest"
              style={{ 
                fontFamily: 'Georgia, serif',
                textShadow: '0 0.5px 0 rgba(0,0,0,0.1)',
              }}
            >
              {i}
            </span>
          ))}
        </div>
        
        {/* Tape hook - tiny metal hook at leading edge */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[2px] w-[3px] h-[6px] rounded-sm bg-[#5E6259]/30 shadow-sm" />
        
        {/* Machined end cap - subtle housing at trailing edge */}
        <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-l from-[#5E6259]/15 to-transparent" />
        
        {/* Active highlight - Cavern Clay */}
        <motion.div
          className="absolute inset-0 bg-[#AC6B53]/15"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      </div>
    </motion.div>
  );
}
