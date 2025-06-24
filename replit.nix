{ pkgs }: {
  deps = [
    pkgs.unzipNLS
    pkgs.nodejs-18_x
    pkgs.nodePackages.npm
  ];
}