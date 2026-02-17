'use client';

import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { colors } from '@/lib/theme';
import { useRouter } from 'next/navigation';

const pluralizeItems = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

export const CollectionsSection = () => {
  const { collections } = useSemanticSearchStore();
  const router = useRouter();

  const handleViewCollection = (collectionId: string) => {
    router.push(`/?collection=${encodeURIComponent(collectionId)}`);
  };

  if (!collections.length) {
    return null;
  }

  return (
    <Box id="collections-section" sx={{ mb: 3, scrollMarginTop: { xs: '64px', md: '120px' } }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 2 }}>
        All Collections
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 2,
        }}>
        {collections.map((collection) => (
          <Box key={collection.id}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                borderRadius: 2,
                borderColor: colors.grey[300],
                overflow: 'hidden',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 4,
                },
              }}>
              <CardActionArea
                onClick={() => handleViewCollection(collection.id)}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  '&:hover .collection-cover': {
                    transform: 'scale(1.03)',
                  },
                }}>
                <Box
                  className="collection-cover"
                  sx={{
                    height: 200,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 300ms ease',
                    backgroundImage: collection.image
                      ? `url("${collection.image.replace(/"/g, '\\"')}")`
                      : `
                        radial-gradient(circle at 18% 20%, rgba(255,255,255,0.3), rgba(255,255,255,0) 40%),
                        radial-gradient(circle at 82% 0%, rgba(255,255,255,0.2), rgba(255,255,255,0) 36%),
                        linear-gradient(135deg, ${colors.primary.light} 0%, ${colors.primary.dark} 100%)
                      `,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'flex-end',
                    '&::after': collection.image
                      ? undefined
                      : {
                          content: '""',
                          position: 'absolute',
                          inset: 0,
                          background:
                            'linear-gradient(135deg, rgba(255,255,255,0.06) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.06) 75%, transparent 75%, transparent)',
                          backgroundSize: '28px 28px',
                          opacity: 0.6,
                        },
                  }}>
                  <Box
                    sx={{
                      width: '100%',
                      p: 2,
                      position: 'relative',
                      zIndex: 1,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0) 25%, rgba(0,0,0,0.45) 100%)',
                    }}>
                    <Typography
                      sx={{
                        color: colors.grey[100],
                        fontWeight: 700,
                        fontSize: '1.15rem',
                        lineHeight: 1.2,
                        textShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
                      }}>
                      {collection.name}
                    </Typography>
                  </Box>
                </Box>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                  <Typography color="text.secondary" sx={{ minHeight: 72 }}>
                    {collection.description || 'No description available for this collection.'}
                  </Typography>
                  <Typography sx={{ mt: 'auto', pt: 1, color: colors.primary.main, fontWeight: 600 }}>
                    {`View ${pluralizeItems(collection.itemCount)} ->`}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
