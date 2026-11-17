using System.Net.Http.Json;

namespace Sin.Api.Services;

public class ResendEmailService(HttpClient http, IConfiguration config, ILogger<ResendEmailService> log)
{
    public async Task<bool> SendVerificationEmailAsync(string userEmail, string displayName, string verificationUrl)
    {
        var apiKey = config["Resend:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
        {
            log.LogWarning("Resend:ApiKey not configured; email not sent");
            return false;
        }

        var senderDomain = config["Resend:SenderDomain"] ?? "noreply@ick.test";
        var subject = "Verify your Ick email";
        var html = $"""
            <h1>Welcome to Ick, {System.Security.SecurityElement.Escape(displayName)}!</h1>
            <p>Click the link below to verify your email and start swiping:</p>
            <p><a href="{System.Security.SecurityElement.Escape(verificationUrl)}" style="background-color: #1EBA92; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Verify Email</a></p>
            <p>Or copy and paste this link:</p>
            <p><code>{System.Security.SecurityElement.Escape(verificationUrl)}</code></p>
            <p>This link expires in 24 hours.</p>
            """;

        var request = new
        {
            from = senderDomain,
            to = userEmail,
            subject,
            html
        };

        try
        {
            http.DefaultRequestHeaders.Authorization = new("Bearer", apiKey);
            http.DefaultRequestHeaders.Add("User-Agent", "Sin-Api/1.0");

            var response = await http.PostAsJsonAsync("https://api.resend.com/emails", request);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                log.LogError("Resend API error {Status}: {Error}", response.StatusCode, error);
                return false;
            }

            log.LogInformation("Verification email sent to {Email}", userEmail);
            return true;
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Failed to send verification email to {Email}", userEmail);
            return false;
        }
    }
}
