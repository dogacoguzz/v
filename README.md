# Velora Serverless Website

A modern, serverless website for the Velora health and fitness app with an `/app-ads.txt` endpoint for advertising verification.

## 🚀 Features

- **Serverless Deployment**: No server management required
- **Modern Design**: Responsive, gradient-based UI with glassmorphism effects
- **App-ads.txt Support**: Proper IAB Tech Lab compliant advertising verification
- **Multiple Deployment Options**: Netlify, Vercel, or GitHub Pages
- **Security Headers**: Built-in security best practices
- **Performance Optimized**: Fast loading with proper caching

## 📁 Files

- `index.html` - Main website with modern design
- `app-ads.txt` - Advertising verification file (Google AdMob compliant)
- `_redirects` - Netlify redirects configuration
- `netlify.toml` - Netlify deployment configuration
- `vercel.json` - Vercel deployment configuration
- `robots.txt` - Search engine crawler configuration
- `README.md` - This documentation

## 🌐 Deployment Options

### Option 1: Netlify (Recommended)

1. **Connect to Git Repository**:
   - Push your code to GitHub/GitLab/Bitbucket
   - Connect your repository to Netlify
   - Netlify will automatically detect the configuration

2. **Manual Deployment**:
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli
   
   # Deploy
   netlify deploy --prod
   ```

3. **Custom Domain** (Optional):
   - Add your custom domain in Netlify dashboard
   - Configure DNS settings

### Option 2: Vercel

1. **Connect to Git Repository**:
   - Push your code to GitHub/GitLab/Bitbucket
   - Import project in Vercel dashboard
   - Vercel will automatically detect the configuration

2. **Manual Deployment**:
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Deploy
   vercel --prod
   ```

### Option 3: GitHub Pages

1. **Enable GitHub Pages**:
   - Go to repository Settings > Pages
   - Select source branch (usually `main`)
   - Set folder to root (`/`)

2. **Custom Domain** (Optional):
   - Add `CNAME` file with your domain
   - Configure DNS settings

## 📱 App-ads.txt (Google AdMob Compliant)

The `/app-ads.txt` endpoint serves a text file containing authorized digital sellers for mobile app advertising, following the IAB Tech Lab specification and Google AdMob requirements.

### Google AdMob Compliance
✅ **Properly configured for Google's crawler**:
- Correct content-type: `text/plain; charset=utf-8`
- Proper caching headers (24 hours)
- Accessible via HTTP/HTTPS
- No authentication required
- Robots.txt configured for crawler access

### Format
```
domain, publisher_id, relationship, certification_authority_id
```

### Current Configuration
The file is configured with your actual Google AdMob publisher ID:
- **Publisher ID**: `pub-7332332500526565`
- **Domain**: `google.com`
- **Relationship**: `DIRECT`
- **Certification Authority**: `f08c47fec0942fa0`

### Google AdMob Crawler
Google uses the `AdsBot-Google-Mobile-Apps` user agent to crawl your app-ads.txt file. The configuration ensures:
- Proper access permissions in robots.txt
- Correct HTTP headers for crawler recognition
- 24-hour cache for efficient crawling
- UTF-8 encoding for international character support

## 🔧 Configuration

### Netlify Configuration (`netlify.toml`)
- Sets proper content-type headers for `/app-ads.txt` (Google AdMob compliant)
- Configures security headers
- Enables CORS for cross-origin access
- 24-hour cache for efficient Google crawler access

### Vercel Configuration (`vercel.json`)
- Routes `/app-ads.txt` requests correctly
- Sets appropriate headers for text file serving (Google AdMob compliant)
- Configures security headers
- 24-hour cache for efficient Google crawler access

### Redirects (`_redirects`)
- Ensures `/app-ads.txt` route works correctly on Netlify
- Returns 200 status code for proper serving

### Robots.txt (`robots.txt`)
- Configures proper access for Google AdMob crawler
- Allows `AdsBot-Google-Mobile-Apps` user agent
- Ensures crawler can access `/app-ads.txt` without restrictions

## 🎨 Design Features

- **Gradient Background**: Modern purple gradient
- **Glassmorphism**: Translucent container with backdrop blur
- **Responsive Grid**: Feature cards that adapt to screen size
- **Hover Effects**: Interactive elements with smooth transitions
- **Typography**: Clean, readable fonts following iOS design principles

## 🔒 Security

Built-in security headers:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection` - XSS protection
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `Referrer-Policy` - Controls referrer information

## 📊 Performance

- **Caching**: 24-hour cache for `/app-ads.txt` (Google AdMob recommended)
- **Compression**: Automatic gzip compression
- **CDN**: Global content delivery network
- **Minimal Dependencies**: No external libraries required
- **Crawler Optimization**: Optimized for Google AdMob crawler efficiency

## 🚀 Quick Start

1. **Clone or download** the files
2. **Choose deployment platform** (Netlify recommended)
3. **Deploy** using platform-specific instructions
4. **Test** the `/app-ads.txt` endpoint
5. **Customize** content and styling as needed

## 🔗 URLs

After deployment, your website will be available at:
- **Main site**: `https://your-domain.com`
- **App-ads.txt**: `https://your-domain.com/app-ads.txt`

## 📝 Customization

### Updating App-ads.txt
1. Edit the `app-ads.txt` file
2. Replace example entries with your actual advertising partners
3. Redeploy the website

### Styling Changes
1. Modify CSS in `index.html`
2. Update colors, fonts, or layout as needed
3. Redeploy to see changes

### Adding Features
1. Add new HTML sections to `index.html`
2. Include additional CSS for styling
3. Test locally before deploying

## 🆘 Troubleshooting

### App-ads.txt Not Loading
- Check deployment platform configuration
- Verify file exists in root directory
- Test with curl: `curl -I https://your-domain.com/app-ads.txt`

### Styling Issues
- Clear browser cache
- Check CSS syntax
- Verify responsive design on different devices

### Deployment Problems
- Check platform-specific logs
- Verify configuration files
- Ensure all files are committed to repository

---

Built with ❤️ for serverless deployment. Perfect for app landing pages and advertising verification. 