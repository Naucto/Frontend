import ProfileGamesSeeAllBase from "@modules/profile/ProfileGamesSeeAllBase";

import React from "react";

export const ProfilePublishedGames: React.FC = () => {
  return (
    <ProfileGamesSeeAllBase
      title="Published games"
      type="published"
      emptyLabel="No published games yet."
    />
  );
};

export default ProfilePublishedGames;
