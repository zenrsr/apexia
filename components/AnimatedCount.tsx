"use client";
import CountUp from "react-countup";
import React from "react";

const AnimatedCount = ({ amount }: { amount: number }) => {
  return (
    <div className="w-full">
      ₹ <CountUp decimal="." decimals={3} prefix="INR " end={amount} />
    </div>
  );
};

export default AnimatedCount;
