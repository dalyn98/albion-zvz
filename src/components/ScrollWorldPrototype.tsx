'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './ScrollWorldPrototype.module.css'

export interface ScrollWorldPrototypeScene {
  id: string
  eyebrow: string
  title: string
  body: string
  counter: string
  tags: string[]
  image: string
  imageAlt: string
  accent: string
}

interface ScrollWorldPrototypeProps {
  brandName: string
  badge: string
  scrollHint: string
  progressLabel: string
  installHref: string
  demoHref: string
  installLabel: string
  demoLabel: string
  scenes: ScrollWorldPrototypeScene[]
}

export default function ScrollWorldPrototype({
  brandName,
  badge,
  scrollHint,
  progressLabel,
  installHref,
  demoHref,
  installLabel,
  demoLabel,
  scenes,
}: ScrollWorldPrototypeProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRefs = useRef<Array<HTMLElement | null>>([])

  useEffect(() => {
    const panels = panelRefs.current.filter(
      (panel): panel is HTMLElement => panel !== null,
    )
    if (panels.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const nextIndex = Number((visible.target as HTMLElement).dataset.sceneIndex)
        if (Number.isInteger(nextIndex)) setActiveIndex(nextIndex)
      },
      {
        rootMargin: '-30% 0px -30% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )

    panels.forEach((panel) => observer.observe(panel))
    return () => observer.disconnect()
  }, [])

  const jumpToScene = (index: number) => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const panel = panelRefs.current[index]
    if (!panel) return

    const top = panel.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }

  const progress =
    scenes.length > 1 ? activeIndex / (scenes.length - 1) : 1

  return (
    <section className={styles.world} aria-label={progressLabel}>
      <div className={styles.stage}>
        <div className={styles.media} aria-live="off">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              className={`${styles.scene} ${
                index === activeIndex ? styles.sceneActive : ''
              }`}
              style={{ '--scene-accent': scene.accent } as CSSProperties}
              aria-hidden={index !== activeIndex}
            >
              <Image
                src={scene.image}
                alt={index === activeIndex ? scene.imageAlt : ''}
                fill
                priority={index === 0}
                sizes="100vw"
                className={styles.sceneImage}
              />
            </div>
          ))}
        </div>

        <div className={styles.vignette} />
        <div className={styles.noise} />

        <div className={styles.stageHeader}>
          <span className={styles.brand}>{brandName}</span>
          <span className={styles.badge}>{badge}</span>
        </div>

        <div className={styles.mobileProgress} aria-hidden="true">
          {scenes.map((scene, index) => (
            <span
              key={scene.id}
              className={index <= activeIndex ? styles.mobileProgressActive : ''}
            />
          ))}
        </div>

        <nav className={styles.progressRail} aria-label={progressLabel}>
          <span className={styles.progressTrack} aria-hidden="true">
            <span
              className={styles.progressFill}
              style={{ transform: `scaleY(${progress})` }}
            />
          </span>
          {scenes.map((scene, index) => (
            <a
              key={scene.id}
              href={`#${scene.id}`}
              className={`${styles.progressButton} ${
                index === activeIndex ? styles.progressButtonActive : ''
              }`}
              onClick={() => jumpToScene(index)}
              aria-current={index === activeIndex ? 'step' : undefined}
              aria-label={`${String(index + 1).padStart(2, '0')}. ${scene.title}`}
            >
              <span
                className={styles.progressDot}
                style={{ '--scene-accent': scene.accent } as CSSProperties}
              />
              <span className={styles.progressText}>{scene.eyebrow}</span>
            </a>
          ))}
        </nav>

        <div className={styles.scrollHint} aria-hidden="true">
          <span>{scrollHint}</span>
          <i />
        </div>
      </div>

      <div className={styles.panels}>
        {scenes.map((scene, index) => (
          <article
            key={scene.id}
            id={scene.id}
            ref={(node) => {
              panelRefs.current[index] = node
            }}
            data-scene-index={index}
            className={`${styles.panel} ${
              index === activeIndex ? styles.panelActive : ''
            }`}
            style={{ '--scene-accent': scene.accent } as CSSProperties}
            aria-labelledby={`${scene.id}-title`}
          >
            <div className={styles.copy}>
              <div className={styles.counter}>{scene.counter}</div>
              <p className={styles.eyebrow}>{scene.eyebrow}</p>
              <h1
                id={`${scene.id}-title`}
                className={index === 0 ? styles.heroTitle : styles.title}
              >
                {scene.title}
              </h1>
              <p className={styles.body}>{scene.body}</p>
              <ul className={styles.tags}>
                {scene.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>

              {index === scenes.length - 1 ? (
                <div className={styles.actions}>
                  <Link className={styles.primaryAction} href={installHref}>
                    {installLabel}
                    <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                  <Link className={styles.secondaryAction} href={demoHref}>
                    <PlayCircle aria-hidden="true" size={16} />
                    {demoLabel}
                  </Link>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
