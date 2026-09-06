import Image from "next/image";

type BrandLogoVariant = "horizontal" | "compact" | "emblem";

const assets: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  horizontal: { src: "/brand/odonto-smart/logos/logo-horizontal-marca-premium.png", width: 400, height: 266 },
  compact: { src: "/brand/odonto-smart/logos/logo-principal.png", width: 400, height: 266 },
  emblem: { src: "/brand/odonto-smart/logos/logo-circular-emblema-marca.png", width: 300, height: 300 },
};

export function BrandLogo({ variant = "horizontal", className = "", priority = false }: { variant?: BrandLogoVariant; className?: string; priority?: boolean }) {
  const asset = assets[variant];
  return <Image className={`brand-logo brand-logo--${variant} ${className}`} src={asset.src} width={asset.width} height={asset.height} alt="Odonto Smart" priority={priority} />;
}
