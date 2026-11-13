using Sin.Mobile.Views;

namespace Sin.Mobile;

public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();
        Routing.RegisterRoute("register", typeof(RegisterPage));
        Routing.RegisterRoute("chat", typeof(ChatPage));
    }
}
