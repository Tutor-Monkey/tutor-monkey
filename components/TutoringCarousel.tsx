"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const tutoringPhotos = [
  {
    src: "/images/tutoring/in-person-percentages.jpg",
    alt: "A Tutor Monkey tutor explaining percentages at a whiteboard",
  },
  {
    src: "/images/tutoring/in-person-fractions.jpg",
    alt: "A Tutor Monkey tutor leading an in-person math lesson",
  },
  {
    src: "/images/tutoring/in-person-english-genres.jpg",
    alt: "A Tutor Monkey tutor teaching English genres during an in-person session",
  },
  {
    src: "/images/tutoring/online-circle-geometry.jpg",
    alt: "An online Tutor Monkey geometry session using a shared whiteboard",
  },
  {
    src: "/images/tutoring/online-levers.jpg",
    alt: "An online Tutor Monkey science session about levers",
  },
];

export default function TutoringCarousel() {
  return (
    <section className="overflow-hidden px-6 pb-16 pt-10">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
        >
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            In person and online
          </p>
          <h2 className="font-display text-3xl font-light text-gray-900 md:text-4xl">
            Tutoring in Action
          </h2>
        </motion.div>

        <div
          className="tutoring-carousel -mx-6"
          role="region"
          aria-label="Tutoring session photo carousel"
        >
          <div className="tutoring-carousel-track">
            {[false, true].map((isDuplicate) => (
              <div
                key={String(isDuplicate)}
                className="tutoring-carousel-group"
                aria-hidden={isDuplicate}
              >
                {tutoringPhotos.map((photo, index) => (
                  <figure
                    key={photo.src}
                    className="relative aspect-[16/10] w-[82vw] flex-none overflow-hidden rounded-2xl bg-gray-100 shadow-sm sm:w-[28rem] lg:w-[34rem]"
                  >
                    <Image
                      src={photo.src}
                      alt={isDuplicate ? "" : photo.alt}
                      fill
                      priority={!isDuplicate && index === 0}
                      sizes="(min-width: 1024px) 34rem, (min-width: 640px) 28rem, 82vw"
                      className="object-cover grayscale"
                    />
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
