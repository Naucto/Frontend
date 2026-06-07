import ProfileGamesSeeAllBase from "@modules/profile/ProfileGamesSeeAllBase";

import React from "react";

export const ProfileLikedGames: React.FC = () => {
  return (
    <ProfileGamesSeeAllBase
      title="Liked games"
      type="liked"
      emptyLabel="No liked games yet."
    />
  );
};

export default ProfileLikedGames;
