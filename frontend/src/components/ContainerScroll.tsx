import React, { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'

/**
 * A framed screen that starts tilted back and settles flat as it scrolls into view, under a title that drifts up with it.
 * Under reduced motion it stays flat and still.
 */
export function ContainerScroll({ titleComponent, children }: { titleComponent: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref })
  const reduce = useReducedMotion()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const rotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [20, 0])
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : isMobile ? [0.7, 0.9] : [1.05, 1])
  const translate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -100])

  return (
    <div className="relative flex h-[52rem] items-center justify-center p-2 md:h-[68rem] md:p-20" ref={ref}>
      <div className="relative w-full py-10 md:py-40" style={{ perspective: '1000px' }}>
        <Header translate={translate}>{titleComponent}</Header>
        <Card rotate={rotate} scale={scale}>{children}</Card>
      </div>
    </div>
  )
}

function Header({ translate, children }: { translate: MotionValue<number>; children: React.ReactNode }) {
  return (
    <motion.div style={{ translateY: translate }} className="mx-auto max-w-5xl text-center">
      {children}
    </motion.div>
  )
}

function Card({ rotate, scale, children }: { rotate: MotionValue<number>; scale: MotionValue<number>; children: React.ReactNode }) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow: '0 0 #00000066, 0 9px 20px #0000005c, 0 37px 37px #00000052, 0 84px 50px #00000038, 0 149px 60px #00000014, 0 233px 65px #00000008',
      }}
      className="mx-auto -mt-12 h-[30rem] w-full max-w-5xl rounded-[30px] border-4 border-navy-700 bg-navy p-2 md:h-[40rem] md:p-6"
    >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-paper md:p-4">{children}</div>
    </motion.div>
  )
}
