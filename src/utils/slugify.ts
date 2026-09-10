import baseSlugify from "slugify";

export function toSlug(input: string): string {
  return baseSlugify(input, { lower: true, strict: true, trim: true });
}
