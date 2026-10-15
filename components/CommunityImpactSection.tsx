"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function CommunityImpactSection() {
  return (
    <section className="px-6 py-20" aria-labelledby="community-impact-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
        <motion.figure
          className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/images/community/minnies-food-pantry-donation.jpg"
            alt="Tutor Monkey presenting a $500 donation to Minnie's Food Pantry in Plano"
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
          />
        </motion.figure>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Community impact
          </p>
          <h2
            id="community-impact-heading"
            className="mb-5 font-display text-4xl font-light text-gray-900 md:text-5xl"
          >
            Supporting Minnie&apos;s Food Pantry
          </h2>
          <p className="mb-8 text-lg font-light leading-relaxed text-gray-600">
            Tutor Monkey donated $500 to Minnie&apos;s Food Pantry in Plano, Texas,
            helping support approximately 1,500 meals for families in our community.
          </p>

          <dl className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <dt className="text-sm font-medium uppercase tracking-wide text-gray-500">
                Donated
              </dt>
              <dd className="mt-2 font-display text-3xl font-semibold text-gray-900">
                $500
              </dd>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <dt className="text-sm font-medium uppercase tracking-wide text-gray-500">
                Meals supported
              </dt>
              <dd className="mt-2 font-display text-3xl font-semibold text-gray-900">
                ≈1,500
              </dd>
            </div>
          </dl>
        </motion.div>
      </div>
    </section>
  );
}
