import { useState, useEffect } from 'react';

export function useAutoPlayTextSequence() {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  const textSequence = [
    {
      headline: "Student-led tutoring, 100% free.",
      subtext: "Plano students helping their peers thrive with no cost lessons."
    },
    {
      headline: "We're a nonprofit built by students for students.",
      subtext: "Every session reinvests into better resources for our community."
    },
    {
      headline: "We've taken the same classes as you.",
      subtext: "From Jasper to West to Senior, we know the system."
    },
    {
      headline: "Tutors who remember what it's like to be stuck.",
      subtext: "No judgment. Just straight answers, study strategies, and encouragement."
    },
    {
      headline: "Ask anything. Work at your pace.",
      subtext: "Live sessions online, with flexible scheduling and zero fees."
    },
    {
      headline: "Ready to stop guessing and start understanding?",
      subtext: "Join a student-led nonprofit committed to free academic support."
    }
  ];

  // Auto-play through text sequence
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => 
        prevIndex === textSequence.length - 1 ? 0 : prevIndex + 1
      );
    }, 3000); // Change text every 3 seconds

    return () => clearInterval(interval);
  }, [textSequence.length]);

  return {
    currentTextIndex,
    textSequence
  };
}
