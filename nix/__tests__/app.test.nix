{ pkgs, lib, ... }:
pkgs.testers.nixosTest {
  name = "app-test-vm";
  nodes.machine = {
    imports = [
      ../modules/deploy-system.nix
      ./base-config.nix
    ];

    environment.systemPackages = [
      (pkgs.callPackage ../pkgs/app-test.nix { }) # installs our application service
    ];

    virtualisation.forwardPorts = [
      {
        from = "host";
        host.port = 6380;
        guest.port = 6379;
      }
    ];

  };

  testScript = ''
    machine.wait_for_unit("multi-user.target")
    machine.succeed("app-test")
  '';
}
