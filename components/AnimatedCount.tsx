"use client";
import CountUp from "react-countup";
import React from "react";

const AnimatedCount = ({ amount }: { amount: number }) => {
  return (
    <div className="w-full">
      ₹ <CountUp decimal="." decimals={2} end={amount} />
    </div>
  );
};

export default AnimatedCount;
