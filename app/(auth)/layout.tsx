import Image from "next/image";

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen w-full justify-between font-inter">
      {children}
      <div className="auth-asset">
        <div>
          <Image
            src="/icons/auth-image.png"
            width={500}
            height={500}
            alt="auth image"
            className="border-2 border-l-black-1 border-t-black-1 border-b-black-1 rounded-l-lg rounded-t-lg rounded-b-lg"
          />
        </div>
      </div>
    </main>
  );
}
