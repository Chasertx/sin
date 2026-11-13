namespace Sin.Mobile;

public partial class App : Application
{
    // Take the service provider rather than AppShell directly: the shell's XAML uses
    // StaticResources (colors/styles) that only exist after InitializeComponent() runs.
    public App(IServiceProvider services)
    {
        InitializeComponent();
        UserAppTheme = AppTheme.Dark;
        MainPage = services.GetRequiredService<AppShell>();
    }
}
