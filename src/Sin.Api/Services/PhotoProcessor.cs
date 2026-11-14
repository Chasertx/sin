using ImageMagick;

namespace Sin.Api.Services;

/// <summary>
/// Turns whatever was uploaded into a clean JPEG: proves it really is an image, bakes in the
/// rotation, shrinks huge photos, and drops hidden data (GPS location, device info) before
/// anyone else can download it.
/// </summary>
public static class PhotoProcessor
{
    public const uint MaxDimension = 1600;
    /// <summary>Refuse absurd dimensions before decoding (a tiny file can claim to be gigantic).</summary>
    public const long MaxPixels = 50_000_000;

    // Only decode formats we mean to accept, whatever the upload claims to be.
    private static readonly MagickFormat[] Allowed = [MagickFormat.Jpeg, MagickFormat.Jpg, MagickFormat.Png, MagickFormat.WebP];

    /// <returns>A JPEG stream positioned at the start, or null if the upload isn't a usable image.</returns>
    public static async Task<MemoryStream?> NormalizeAsync(Stream input, CancellationToken ct = default)
    {
        try
        {
            using var buffer = new MemoryStream();
            await input.CopyToAsync(buffer, ct);
            var bytes = buffer.ToArray();

            var info = new MagickImageInfo(bytes); // reads the header only
            if (!Allowed.Contains(info.Format)) return null;
            if (info.Width == 0 || info.Height == 0 || (long)info.Width * info.Height > MaxPixels) return null;

            using var image = new MagickImage(bytes, new MagickReadSettings { Format = info.Format });
            image.AutoOrient(); // uses the EXIF rotation, so do it before the metadata is removed
            if (image.Width > MaxDimension || image.Height > MaxDimension)
                image.Resize(new MagickGeometry(MaxDimension, MaxDimension)); // fits inside, keeps proportions
            image.Strip(); // EXIF (incl. GPS), IPTC, XMP, comments
            image.ColorAlpha(MagickColors.White); // JPEG has no transparency: flatten onto white
            image.Format = MagickFormat.Jpeg;
            image.Quality = 85;

            var output = new MemoryStream();
            await image.WriteAsync(output, ct);
            output.Position = 0;
            return output;
        }
        catch (MagickException)
        {
            return null;
        }
    }
}
