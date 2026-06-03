import React from "react";
import ProfileGamesSeeAllBase from "@modules/profile/ProfileGamesSeeAllBase";

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
