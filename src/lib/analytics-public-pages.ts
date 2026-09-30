import { drones } from "./content";
import { products } from "./shop";
import type { PublicPages } from "./analytics-consent";

// Static published catalog slugs only; no database, form or user-derived titles.
export const analyticsPublicPages: PublicPages = {
  "/": "Home", "/fleet": "Our drones",
  "/portfolio": "Portfolio", "/shop": "Shop",
  "/contact": "Contact", "/credits": "Photo credits",
  ...Object.fromEntries(drones.map(({ slug }) => [`/fleet/${slug}`, `Drone: ${slug.replaceAll("-", " ")}`])),
  ...Object.fromEntries(products.map(({ slug }) => [`/shop/${slug}`, `Product: ${slug.replaceAll("-", " ")}`])),
};
