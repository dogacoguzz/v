# Velora - Fitness App Website

A beautiful, modern website for Velora, the indie-built fitness buddy that turns your sweat into progress you can actually see.

## Features

- **Modern Design**: Clean, card-based layout with gradient backgrounds
- **Responsive**: Optimized for all devices (mobile, tablet, desktop)
- **Fast Loading**: Minimal dependencies, optimized for performance
- **Serverless**: Ready for deployment on Cloudflare Pages
- **App Ads Support**: Includes `/app-ads.txt` route for mobile app advertising

## Design Inspiration

The website design is inspired by the Velora mobile app's clean, modern interface featuring:
- Gradient backgrounds (blue to purple)
- Card-based layouts with subtle shadows
- Clean typography using Inter font
- Colorful feature icons with gradients
- Smooth animations and hover effects

## File Structure

```
├── index.html          # Main website page
├── app-ads.txt         # App advertising configuration
├── _redirects          # Cloudflare Pages routing
└── README.md          # This file
```

## Deployment to Cloudflare Pages

### Option 1: Deploy via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** → **Create a project**
3. Choose **Connect to Git**
4. Select your GitHub repository
5. Configure build settings:
   - **Build command**: Leave empty (static site)
   - **Build output directory**: Leave empty (root directory)
   - **Root directory**: Leave empty
6. Click **Save and Deploy**

### Option 2: Deploy via Wrangler CLI

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Deploy the site:
   ```bash
   wrangler pages deploy . --project-name velora-website
   ```

## Routes

- `/` - Main website homepage
- `/app-ads.txt` - App advertising configuration file

## Customization

### Colors
The website uses a blue-to-purple gradient theme. You can customize colors by modifying the CSS variables in the `<style>` section of `index.html`.

### Content
Update the content in `index.html` to match your specific messaging and features.

### App Ads
Update `app-ads.txt` with your actual ad network information when implementing advertising in your mobile app.

## Performance

The website is optimized for performance with:
- Minimal external dependencies (only Google Fonts)
- Optimized CSS with no unused styles
- Fast loading times
- Mobile-first responsive design

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

This project is created for Velora. All rights reserved. 