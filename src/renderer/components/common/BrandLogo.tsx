interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <img
      className={"brand-logo " + className}
      src="/grungus-512.webp"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      draggable={false}
    />
  );
}
