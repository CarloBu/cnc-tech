import { defineCollection, z } from 'astro:content';

const cardsCollection = defineCollection({
	type: 'data',
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			image: image(),
		}),
});

export const collections = {
	cardsCollection: cardsCollection,
};
